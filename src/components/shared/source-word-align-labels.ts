import { msg } from '@lit/localize';

export type SourceWordAlignScope = 'segment' | 'whole';

/** Button label; scope must stay visible when cached (not generic「重新生成」). */
export function sourceWordAlignButtonLabel(scope: SourceWordAlignScope, hasCache: boolean): string {
  if (scope === 'segment') {
    return hasCache ? msg('重新生成本句') : msg('生成本句词条');
  }
  return hasCache ? msg('重新生成全部') : msg('生成全部词条');
}

export function sourceWordAlignPopconfirmTitle(scope: SourceWordAlignScope): string {
  return scope === 'segment'
    ? msg('已有本句词条，是否重新生成？')
    : msg('已有全部词条，是否重新生成？');
}

export function sourceWordAlignTooltip(scope: SourceWordAlignScope, hasCache: boolean): string {
  if (scope === 'segment') {
    return hasCache
      ? msg('重新生成本句的原音词条')
      : msg('为当前句生成原音词条');
  }
  return hasCache
    ? msg('重新为全部句子生成原音词条（整段原音会重新上传）')
    : msg('为全部句子生成原音词条（整段原音上传一次，已有则跳过）');
}
