import { MenuGrid, type MenuSection } from '../../design-system/index.ts'
import {
  AlertIcon,
  CheckIcon,
  ChatIcon,
  HomeIcon,
  LayersIcon,
  LeafIcon,
  PeopleIcon,
  PersonIcon,
  SpoonIcon,
} from '../../design-system/icons.tsx'

/**
 * «منو» پنل مربی — فهرست کامل کارها.
 *
 * تا اینجا نامش «بیشتر» بود و هم فهرست بود هم پرونده شخصی مربی، قاطیِ
 * هم. مربی برای رسیدن به «بازی آزاد» باید از میان مدارک و بازخورد
 * مدیر رد می‌شد.
 *
 * حالا فهرست اینجاست و پرونده شخصی مقصد خودش را دارد. مقصدهایی که در
 * نوار پایین هم خانه دارند عمداً تکرار شده‌اند: کسی که نمی‌داند دنبال
 * چه می‌گردد، جایی لازم دارد که همه‌چیز را یک‌جا ببیند.
 */
export function TeacherMorePage({ onGo }: { onGo: (id: string) => void }) {
  const sections: MenuSection[] = [
    {
      title: 'کارِ امروز',
      items: [
        { id: 'today', label: 'امروز', hint: 'ورود و خروج کودکان', icon: <HomeIcon size={20} />, tone: 'mint' },
        { id: 'bulk', label: 'ثبت گروهی', hint: 'ناهار، خواب، حال روز', icon: <SpoonIcon size={20} />, tone: 'mango' },
        { id: 'close', label: 'بستن روز', hint: 'بررسی و ارسال گزارش‌ها', icon: <CheckIcon size={20} />, tone: 'sky' },
        { id: 'inbox', label: 'پیام‌ها', hint: 'گفتگو با خانواده و مدیر', icon: <ChatIcon size={20} />, tone: 'bubble' },
      ],
    },
    {
      title: 'کودکان',
      items: [
        { id: 'play', label: 'بازی آزاد', hint: 'ثبت انتخاب گوشه‌ها', icon: <LeafIcon size={20} />, tone: 'grape' },
        { id: 'observe', label: 'مشاهده‌ها', hint: 'یادداشت و گزارش ماهانه', icon: <PeopleIcon size={20} />, tone: 'mint' },
      ],
    },
    {
      title: 'مهد',
      items: [
        { id: 'meals', label: 'غذای امروز', hint: 'چند بشقاب و برای چه کسانی', icon: <SpoonIcon size={20} />, tone: 'coral' },
        { id: 'loans', label: 'دفتر امانت', hint: 'چه کودکی چه چیزی برده', icon: <LayersIcon size={20} />, tone: 'mango' },
        { id: 'account', label: 'حساب من', hint: 'مرخصی، مدارک، بازخورد', icon: <PersonIcon size={20} />, tone: 'grape' },
      ],
    },
  ]

  return (
    <>
      <MenuGrid sections={sections} onSelect={onGo} />
      <p className="menu-foot t-caption">
        <span aria-hidden><AlertIcon size={14} /></span>{' '}
        برای خروج از حساب، کلید حساب کاربری در بالای صفحه.
      </p>
    </>
  )
}
