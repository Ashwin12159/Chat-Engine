export const ENUM_FEATURES = {
  CHAT_SDK: 'chat_sdk',
  BOTS: 'bots',
} as const;
export type FeatureType = typeof ENUM_FEATURES[keyof typeof ENUM_FEATURES];
