window.GALERIES_CONFIG = {
  supabaseUrl: "https://rrytedgilrwsczoqeyzx.supabase.co",
  supabaseAnonKey: "sb_publishable_MpZh8QKptURrOt0JqfRULA_eZHpVhO2",
  demoMode: true,
  demoAccessCode: "DEMO2026",
  demoClosedAccessCode: "DEMOFERMEE",
  demoPricing: {
    unitPriceCents: 500,
    tiers: [
      { minPhotos: 1, discountBps: 0 },
      { minPhotos: 5, discountBps: 2000 },
      { minPhotos: 10, discountBps: 2500 },
      { minPhotos: 15, discountBps: 3000 }
    ]
  }
};

export function getConfig() {
  return window.GALERIES_CONFIG;
}
