import * as Green20220302 from "@alicloud/green20220302";
import { ImageModerationRequest } from "@alicloud/green20220302";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { RuntimeOptions } from "@alicloud/tea-util";
import { randomUUID } from "node:crypto";

const ENDPOINT = "green-cip.cn-shanghai.aliyuncs.com";
const DEFAULT_SERVICE = "baselineCheck";

export interface ImageModerationOutput {
  pass: boolean;
  message?: string;
}

const GreenClient =
  (Green20220302 as any).default?.default ??
  (Green20220302 as any).default ??
  Green20220302;

let clientInstance: any | null = null;

function getClient(): any {
  if (clientInstance) return clientInstance;

  const accessKeyId = process.env.ALIBABA_CLOUD_IMAGE_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_IMAGE_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      "阿里云图片审核未配置：请设置 ALIBABA_CLOUD_IMAGE_ACCESS_KEY_ID 和 ALIBABA_CLOUD_IMAGE_ACCESS_KEY_SECRET",
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

export function isImageModerationConfigured(): boolean {
  return (
    !!process.env.ALIBABA_CLOUD_IMAGE_ACCESS_KEY_ID &&
    !!process.env.ALIBABA_CLOUD_IMAGE_ACCESS_KEY_SECRET
  );
}

function isSafeRiskLevel(riskLevel?: string): boolean {
  if (!riskLevel) return true;
  const normalized = riskLevel.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "none" ||
    normalized === "pass" ||
    normalized === "no_risk" ||
    normalized === "norisk"
  );
}

function isSafeDescription(description?: string): boolean {
  if (!description) return true;
  const normalized = description.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized.includes("no risk") ||
    normalized.includes("pass") ||
    normalized.includes("未检测出风险")
  );
}

export async function moderateImage(
  imageUrl: string,
  service: string = DEFAULT_SERVICE,
): Promise<ImageModerationOutput> {
  if (!imageUrl?.trim()) return { pass: true };
  if (!isImageModerationConfigured()) return { pass: true };

  const client = getClient();
  const request = new ImageModerationRequest({
    service,
    serviceParameters: JSON.stringify({
      dataId: randomUUID(),
      imageUrl: imageUrl.trim(),
    }),
  });
  const runtime = new RuntimeOptions({});

  try {
    const response = await client.imageModerationWithOptions(request, runtime);
    const body = response.body as {
      code?: number;
      msg?: string;
      data?: {
        result?: Array<{ label?: string; description?: string; riskLevel?: string }>;
        riskLevel?: string;
      };
    };

    const code = body?.code ?? 0;
    if (code !== 200) {
      return { pass: false, message: body?.msg ?? "图片审核异常" };
    }

    if (!isSafeRiskLevel(body?.data?.riskLevel)) {
      const first = body?.data?.result?.[0];
      return {
        pass: false,
        message: first?.description ?? first?.label ?? "图片未通过审核",
      };
    }

    const result = body?.data?.result ?? [];
    const riskyResult = result.find((item) => {
      return !isSafeRiskLevel(item.riskLevel) || !isSafeDescription(item.description);
    });

    if (riskyResult) {
      return {
        pass: false,
        message: riskyResult.description ?? riskyResult.label ?? "图片未通过审核",
      };
    }

    return { pass: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`图片审核服务异常: ${message}`);
  }
}

export async function moderateImages(
  imageUrls: string[],
  service: string = DEFAULT_SERVICE,
): Promise<ImageModerationOutput> {
  if (!imageUrls?.length) return { pass: true };
  if (!isImageModerationConfigured()) return { pass: true };

  for (const url of imageUrls) {
    const out = await moderateImage(url, service);
    if (!out.pass) return out;
  }

  return { pass: true };
}
