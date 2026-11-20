import { createPortfolioClickHandler } from "../../../../lib/portfolio-chat/click-handler";
import { assistantConfig } from "../../../../portfolio-assistant.server";
export const runtime = "nodejs";
export const POST = createPortfolioClickHandler(assistantConfig);
