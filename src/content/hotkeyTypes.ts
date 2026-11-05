// 键位结构的最小形状（与 shared/settings 的 HotkeyCombo 字段一致）
export interface HotkeyLike {
  key: string;
  code?: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
}
