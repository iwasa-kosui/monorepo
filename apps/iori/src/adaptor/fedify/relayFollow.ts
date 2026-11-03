import { Follow } from '@fedify/fedify';

const PUBLIC_IRI = 'https://www.w3.org/ns/activitystreams#Public';

const expandPublic = (value: unknown): unknown => value === 'as:Public' || value === 'Public' ? PUBLIC_IRI : value;

const expandPublicAll = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(expandPublic) : expandPublic(value);

export class RelayFollow extends Follow {
  override async toJsonLd(options?: Parameters<Follow['toJsonLd']>[0]): Promise<unknown> {
    const json = await super.toJsonLd(options);
    if (options?.format === 'expand' || typeof json !== 'object' || json === null || Array.isArray(json)) {
      return json;
    }
    const compact = json as Record<string, unknown>;
    return {
      ...compact,
      ...('object' in compact ? { object: expandPublicAll(compact.object) } : {}),
      ...('to' in compact ? { to: expandPublicAll(compact.to) } : {}),
    };
  }
}
