export interface MetaConnectionSettings {
  phoneNumberId: string;
  apiVersion: string;
  accessToken: string;
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number };
}

export async function testMetaConnection(settings: MetaConnectionSettings) {
  const url = new URL(`https://graph.facebook.com/${settings.apiVersion}/${settings.phoneNumberId}`);
  url.searchParams.set('fields', 'display_phone_number,verified_name,quality_rating');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${settings.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json() as GraphError & Record<string, unknown>;
  if (!response.ok) {
    const details = body.error;
    throw new Error(details?.message ?? `Meta Graph API respondeu HTTP ${response.status}.`);
  }

  return {
    ok: true,
    displayPhoneNumber: body.display_phone_number,
    verifiedName: body.verified_name,
    qualityRating: body.quality_rating,
  };
}
