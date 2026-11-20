import { createPortfolioChatHandler } from "../../../lib/portfolio-chat/handler";
import { assistantConfig } from "../../../portfolio-assistant.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createPortfolioChatHandler(assistantConfig);
