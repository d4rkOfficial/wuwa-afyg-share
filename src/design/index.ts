// 设计系统 v2 出口：业务代码只从这里 import，不直接引用具体文件。
// 组件一律 Wk 前缀，避免与旧系统（@/ui 的 Button/Field 等）在迁移期同名冲突。
export { cn } from './cn'

export { WkButton, WkIconButton, type WkButtonProps, type WkButtonSize, type WkButtonVariant } from './button'

export {
    WkField,
    WkInput,
    WkSelect,
    WkSegmented,
    WkSwitch,
    WkTextarea,
    useFieldId,
    type WkSegmentedOption
} from './form'

export { WkDropdown, type WkDropdownGroup, type WkDropdownOption } from './dropdown'

export { WkTagInput } from './tag-input'

export {
    WkBadge,
    WkCard,
    WkDivider,
    WkEmpty,
    WkNum,
    WkPageHead,
    WkRow,
    WkRows,
    WkSectionHead,
    WkSpacer,
    WkToolbar,
    type WkBadgeTone
} from './surface'

export { WkConfirm, WkDialog, WkMenu, type WkMenuItem } from './overlay'

export { WkToaster, wkDismiss, wkToast, type WkToastType } from './toast'

export { WkContainer, WkRoot } from './shell'
