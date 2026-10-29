const textEncoder = new TextEncoder();
const maxZip32Value = 0xffffffff;

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let remainder = value;
  for (let bit = 0; bit < 8; bit += 1) {
    remainder = remainder & 1
      ? 0xedb88320 ^ (remainder >>> 1)
      : remainder >>> 1;
  }
  return remainder >>> 0;
});

async function checksum(blob) {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const byte of value) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  };
}

function writeHeader(length) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  return { bytes, view };
}

export async function createZipBlob(files) {
  if (!files.length || files.length > 0xffff) {
    throw new Error("La sélection doit contenir entre 1 et 65 535 photos pour créer l’archive.");
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const timestamp = zipDateTime(new Date());

  for (const file of files) {
    const name = textEncoder.encode(file.name);
    if (name.length > 0xffff || file.blob.size > maxZip32Value) {
      throw new Error("Une photo est trop volumineuse pour être ajoutée à cette archive ZIP.");
    }
    const crc = await checksum(file.blob);
    const localHeader = writeHeader(30);
    localHeader.view.setUint32(0, 0x04034b50, true);
    localHeader.view.setUint16(4, 20, true);
    localHeader.view.setUint16(6, 0x0800, true);
    localHeader.view.setUint16(8, 0, true);
    localHeader.view.setUint16(10, timestamp.time, true);
    localHeader.view.setUint16(12, timestamp.date, true);
    localHeader.view.setUint32(14, crc, true);
    localHeader.view.setUint32(18, file.blob.size, true);
    localHeader.view.setUint32(22, file.blob.size, true);
    localHeader.view.setUint16(26, name.length, true);
    localParts.push(localHeader.bytes, name, file.blob);

    const centralHeader = writeHeader(46);
    centralHeader.view.setUint32(0, 0x02014b50, true);
    centralHeader.view.setUint16(4, 20, true);
    centralHeader.view.setUint16(6, 20, true);
    centralHeader.view.setUint16(8, 0x0800, true);
    centralHeader.view.setUint16(10, 0, true);
    centralHeader.view.setUint16(12, timestamp.time, true);
    centralHeader.view.setUint16(14, timestamp.date, true);
    centralHeader.view.setUint32(16, crc, true);
    centralHeader.view.setUint32(20, file.blob.size, true);
    centralHeader.view.setUint32(24, file.blob.size, true);
    centralHeader.view.setUint16(28, name.length, true);
    centralHeader.view.setUint32(42, localOffset, true);
    centralParts.push(centralHeader.bytes, name);

    localOffset += 30 + name.length + file.blob.size;
    if (localOffset > maxZip32Value) {
      throw new Error("La sélection est trop volumineuse pour créer une seule archive ZIP. Téléchargez moins de photos à la fois.");
    }
  }

  const centralSize = centralParts.reduce(
    (size, part) => size + (part.size ?? part.byteLength),
    0
  );
  if (centralSize > maxZip32Value) {
    throw new Error("La sélection est trop volumineuse pour créer une seule archive ZIP.");
  }

  const endRecord = writeHeader(22);
  endRecord.view.setUint32(0, 0x06054b50, true);
  endRecord.view.setUint32(12, centralSize, true);
  endRecord.view.setUint32(16, localOffset, true);
  endRecord.view.setUint16(8, files.length, true);
  endRecord.view.setUint16(10, files.length, true);

  return new Blob([...localParts, ...centralParts, endRecord.bytes], {
    type: "application/zip"
  });
}
