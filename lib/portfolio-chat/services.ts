import "server-only";
import type { generateText, LanguageModel } from "ai";
import { configureModel } from "./provider";
import { recordEvent, reserveQuota, type AnalyticsEvent } from "./supabase";

export type ServiceEnvironment = Readonly<Record<string, string | undefined>>;
export type ConfiguredModel = {
  provider: string;
  modelId: string;
  model: LanguageModel;
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
};

/** Trusted server-side adapter; public provider/model policy still applies. */
export interface ModelProvider {
  configure(env: ServiceEnvironment): ConfiguredModel | null;
}

/** Must atomically reserve a shared request and cost budget before returning true. */
export interface Quota {
  reserve(env: ServiceEnvironment): Promise<boolean>;
}

/** Receives bounded metadata only. Failures must not affect chat or navigation. */
export interface Analytics {
  record(event: AnalyticsEvent, env: ServiceEnvironment): Promise<void>;
}

export type PortfolioServices = {
  modelProvider: ModelProvider;
  quota: Quota;
  analytics: Analytics | null;
};

export const defaultPortfolioServices: PortfolioServices = {
  modelProvider: { configure: configureModel },
  quota: { reserve: reserveQuota },
  analytics: { record: recordEvent },
};

export function portfolioServices(overrides: Partial<PortfolioServices> = {}): PortfolioServices {
  return {
    modelProvider: overrides.modelProvider ?? defaultPortfolioServices.modelProvider,
    quota: overrides.quota ?? defaultPortfolioServices.quota,
    analytics: overrides.analytics === undefined ? defaultPortfolioServices.analytics : overrides.analytics,
  };
}

export async function recordSafely(analytics: Analytics | null, event: AnalyticsEvent, env: ServiceEnvironment): Promise<void> {
  try { await analytics?.record(event, env); } catch { /* analytics is optional */ }
}
