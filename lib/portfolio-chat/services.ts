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

/** Trusted server-side adapter. Public access requires an explicit model policy. */
export interface ModelProvider {
  configure(env: ServiceEnvironment): ConfiguredModel | null;
  allowsPublic?(model: ConfiguredModel): boolean;
}

/** Must atomically reserve a shared request and cost budget before returning true. */
export interface Quota {
  reserve(env: ServiceEnvironment, signal: AbortSignal): Promise<boolean>;
}

/** Receives bounded metadata only. Failures must not affect chat or navigation. */
export interface Analytics {
  record(event: AnalyticsEvent, env: ServiceEnvironment, signal: AbortSignal): Promise<void>;
}

export type PortfolioServices = {
  modelProvider: ModelProvider;
  quota: Quota;
  analytics: Analytics | null;
};

export const defaultPortfolioServices: PortfolioServices = {
  modelProvider: {
    configure: configureModel,
    allowsPublic: model => (model.provider === "qwen" && /^qwen3\.7-flash(?:-\d{4}-\d{2}-\d{2})?$/u.test(model.modelId)) ||
      (model.provider === "openai" && model.modelId === "gpt-4o-mini"),
  },
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

async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Portfolio service timed out")); }, 3500);
    });
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function recordSafely(analytics: Analytics | null, event: AnalyticsEvent, env: ServiceEnvironment): Promise<void> {
  if (!analytics) return;
  try { await withDeadline(signal => analytics.record(event, env, signal)); } catch { /* analytics is optional */ }
}

export async function reserveSafely(quota: Quota, env: ServiceEnvironment): Promise<boolean> {
  return withDeadline(signal => quota.reserve(env, signal));
}
