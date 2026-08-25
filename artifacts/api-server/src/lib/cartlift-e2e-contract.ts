export const CARTLIFT_E2E_STEPS = [
  'install_shop',
  'authenticate_session',
  'load_extension',
  'render_cartlift',
  'record_impression',
  'add_recommendation',
  'reach_shipping_goal',
  'record_purchase_attribution',
  'read_dashboard_metrics',
] as const;

export type CartLiftE2EStep = typeof CARTLIFT_E2E_STEPS[number];
