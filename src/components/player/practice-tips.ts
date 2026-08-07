import { msg } from '@lit/localize';

export type PracticeTipsKind = 'shadowing' | 'echo' | 'discrimination';

export function getShadowingTips(): string[] {
  return [
    msg(
      '影子跟读：点击下方【麦克风】→【倒计时】→ 播放【原音】并【开始录音】；原音播完【自动】停止录音（也可手动停止）。',
    ),
    msg('温馨提示：'),
    msg('1. 建议使用耳机练习。'),
    msg('2. 点击【麦克风】之前可操作播放器；点击之后播放器锁定，不可操作。'),
    msg('3. 跟不上原音时，请在点麦前设置倍速、单句暂停。'),
    msg('4. 开始录音时仅保留倍速、音量、单句暂停；循环、睡眠等其他设置会被忽略。'),
    msg(
      '5. 句间空隙可在设置中选择「压缩为约 1 秒」或「保留完整空隙」；压缩更利于按句对照，保留更贴近完整作品节奏。',
    ),
    msg('6. 录音时底部会显示状态与波形，全屏字幕下也可看到。'),
  ];
}

export function getEchoTips(): string[] {
  return [
    msg(
      '回声跟读：点击字幕行右侧【麦克风】→ 播放该句【原音】→【倒计时】→【开始录音】；跟读完成后需【手动】停止录音。',
    ),
    msg('温馨提示：'),
    msg('1. 建议使用耳机练习。'),
    msg('2. 点击【麦克风】之前可操作播放器；点击之后播放器锁定，不可操作。'),
    msg('3. 开始录音时仅保留倍速、音量；单句暂停会关闭，循环、睡眠等其他设置会被忽略。'),
    msg('4. 录音时底部会显示状态与波形，全屏字幕下也可看到。'),
  ];
}

export function getDiscriminationTips(): string[] {
  return [
    msg('抗噪听：选择噪音并调音量 → 播放主音频；速听阶梯控制主轨倍速（噪音不变速）。只听不录。'),
    msg('温馨提示：'),
    msg('1. 播放器始终可用（进度/音量/切句/切歌等等）；可随时调整噪音与阶梯。'),
    msg('2. 噪音跟随主轨播放/暂停；单条噪音播完会自动循环。播放中改选噪音或音量会立即生效。'),
    msg(
      '3. 速听阶梯按「正序再回落」播放完整主轨；播放中改阶梯会重置到第一档并立即应用。切歌后阶梯进度重置，设置保留。',
    ),
    msg('4. 该模式不显示倍速、循环、睡眠、单句暂停与高级设置。'),
  ];
}

export function getShadowingSummary(): string {
  return msg('点击下方【麦克风】开始影子跟读（边听边录）。');
}

export function getDiscriminationSummary(): string {
  return msg('只听不录；可随时调整噪音与速听阶梯，倍速由阶梯控制。');
}

export function getEchoSummary(): string {
  return msg('点击字幕行右侧【麦克风】：先听原音，再录音。');
}

export function getTipsForKind(kind: PracticeTipsKind): string[] {
  if (kind === 'shadowing') return getShadowingTips();
  if (kind === 'echo') return getEchoTips();
  return getDiscriminationTips();
}

export function getTipsTitle(kind: PracticeTipsKind): string {
  if (kind === 'shadowing') return msg('影子跟读说明');
  if (kind === 'echo') return msg('回声跟读说明');
  return msg('抗噪听说明');
}
