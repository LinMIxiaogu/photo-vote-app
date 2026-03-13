import * as Green20220302 from "@alicloud/green20220302";
import { TextModerationRequest } from "@alicloud/green20220302";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { RuntimeOptions } from "@alicloud/tea-util";

const ENDPOINT = "green-cip.cn-shanghai.aliyuncs.com";

export type ModerationResult = "pass" | "review" | "block";

export interface TextModerationOutput {
  pass: boolean;
  result?: ModerationResult;
  message?: string;
}

const GreenClient =
  (Green20220302 as any).default?.default ??
  (Green20220302 as any).default ??
  Green20220302;

let clientInstance: any | null = null;

function getClient(): any {
  if (clientInstance) return clientInstance;

  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      "阿里云文本审核未配置：请设置 ALIBABA_CLOUD_ACCESS_KEY_ID 和 ALIBABA_CLOUD_ACCESS_KEY_SECRET",
    );
  }

  const config = new $OpenApiUtil.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: ENDPOINT,
  });
  clientInstance = new GreenClient(config);
  return clientInstance;
}

export function isTextModerationConfigured(): boolean {
  return (
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID &&
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
  );
}

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function isSafeTextDescription(description?: string): boolean {
  const text = normalize(description);
  return text === "" || text.includes("no risk") || text.includes("未检测出风险") || text.includes("pass");
}

function inferResult(labels?: string, reason?: string, descriptions?: string): ModerationResult {
  const combined = [labels, reason, descriptions].map(normalize).join(" ");
  if (!combined) return "pass";
  if (combined.includes("review") || combined.includes("审核") || combined.includes("suspect")) {
    return "review";
  }
  return "block";
}

export async function moderateText(
  content: string,
  service: string = "ugc_moderation_byllm_pro",
): Promise<TextModerationOutput> {
  if (!content || !content.trim()) {
    return { pass: true, result: "pass" };
  }
  if (!isTextModerationConfigured()) {
    return { pass: true, result: "pass" };
  }

  const client = getClient();
  const request = new TextModerationRequest({
    service,
    serviceParameters: JSON.stringify({ content: content.trim() }),
  });
  const runtime = new RuntimeOptions({});

  try {
    const response = await client.textModerationWithOptions(request, runtime);
    const body = response.body as {
      code?: number;
      message?: string;
      data?: { labels?: string; descriptions?: string; reason?: string };
    };

    const code = body?.code ?? 0;
    if (code !== 200) {
      return {
        pass: false,
        result: "review",
        message: body?.message ?? "审核异常",
      };
    }

    const data = body?.data;
    if (!data) {
      return { pass: true, result: "pass" };
    }

    const labels = normalize(data.labels);
    const descriptions = data.descriptions?.trim();
    const reason = data.reason?.trim();

    if (!labels) {
      return { pass: true, result: "pass" };
    }

    if (isSafeTextDescription(descriptions)) {
      return { pass: true, result: "pass" };
    }

    return {
      pass: false,
      result: inferResult(labels, reason, descriptions),
      message: descriptions ?? reason ?? labels,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`文本审核服务异常: ${message}`);
  }
}
