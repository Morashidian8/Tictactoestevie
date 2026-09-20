import { MenuGrid, type MenuSection } from '../../design-system/index.ts'
import {
  AlertIcon,
  CalendarIcon,
  ChatIcon,
  HomeIcon,
  ImageIcon,
  LayersIcon,
  MegaphoneIcon,
  PeopleIcon,
  PersonIcon,
  ShieldCheckIcon,
  SpoonIcon,
  WalletIcon,
} from '../../design-system/icons.tsx'
import type { ManagerPage } from './ManagerApp.tsx'

/**
 * «منو» پنل مدیر — فهرست کامل کارها.
 *
 * تا اینجا نامش «بیشتر» بود و فقط سه چیزی در آن می‌نشست که جایی در
 * نوار پایین نداشتند. یعنی مدیر برای هر کاری باید می‌دانست کدام‌یک در
 * نوار است و کدام در فهرست.
 *
 * حالا **همه‌چیز** اینجاست، از جمله مقصدهایی که در نوار هم خانه دارند.
 * دو راه به یک صفحه ایراد نیست وقتی یکی از آن دو «فهرستِ همه کارها»
 * باشد؛ کسی که نمی‌داند دنبال چه می‌گردد، جایی لازم دارد که همه‌چیز را
 * یک‌جا ببیند.
 *
 * ترتیب دسته‌ها از روی تناوب است، نه اهمیت: مدیر روزانه سراغ کودکان و
 * مالی می‌رود، ماهی یک بار سراغ بازرسی.
 */
export function ManagerMorePage({ onGo, gaps, claims }: {
  onGo: (page: ManagerPage) => void
  /** شمار کاستی‌های پرونده بازرسی. */
  gaps: number
  /** اعلام‌های پرداخت در انتظار تصمیم. */
  claims: number
}) {
  const sections: MenuSection[] = [
    {
      title: 'هر روز',
      items: [
        { id: 'dashboard', label: 'خانه', hint: 'خلاصه امروز مهد', icon: <HomeIcon size={20} />, tone: 'mint' },
        { id: 'children', label: 'کودکان', hint: 'پرونده، آلرژی، سرپرستان', icon: <PeopleIcon size={20} />, tone: 'sky' },
        { id: 'messages', label: 'پیام‌ها', hint: 'گفتگو با مربی و خانواده', icon: <ChatIcon size={20} />, tone: 'bubble' },
        { id: 'finance', label: 'مالی', hint: 'شهریه، وصولی، هزینه', icon: <WalletIcon size={20} />, tone: 'mango', badge: claims },
      ],
    },
    {
      title: 'برنامهٔ مهد',
      items: [
        { id: 'program', label: 'برنامه مهد', hint: 'تقویم و نظرسنجی', icon: <CalendarIcon size={20} />, tone: 'grape' },
        /*
          منوی غذایی و برنامه مهد یک صفحه‌اند ولی دو کارِ متفاوت: یکی
          ماهی یک بار نوشتن منو و قیمت، دیگری تقویم و نظرسنجی. دو کاشی
          با دو شناسه، چون مدیر با دو سؤال متفاوت دنبالشان می‌گردد.
        */
        { id: 'meals', label: 'منوی غذایی', hint: 'منوی ماه، قیمت، رسیدها', icon: <SpoonIcon size={20} />, tone: 'mango' },
        { id: 'loans', label: 'دفتر امانت', hint: 'چه کودکی چه چیزی برده', icon: <LayersIcon size={20} />, tone: 'sky' },
        { id: 'notice', label: 'اطلاع‌رسانی', hint: 'تعطیلی و خبر فوری', icon: <MegaphoneIcon size={20} />, tone: 'coral' },
      ],
    },
    {
      title: 'مهد و کارکنان',
      items: [
        { id: 'staff', label: 'کارکنان', hint: 'پرونده، مدارک، مرخصی', icon: <PersonIcon size={20} />, tone: 'mint' },
        { id: 'brand', label: 'هویت مهد', hint: 'نام و نشان مهد در اپ', icon: <ImageIcon size={20} />, tone: 'grape' },
        {
          id: 'audit',
          label: 'پرونده بازرسی',
          hint: 'آنچه بازرس می‌خواهد',
          icon: <ShieldCheckIcon size={20} />,
          tone: 'coral',
          badge: gaps,
        },
      ],
    },
  ]

  return (
    <>
      <MenuGrid sections={sections} onSelect={(id) => onGo(id as ManagerPage)} />

      {/*
        آنچه اینجا نیست و عمدی است: هیچ گزینه‌ای برای حذف داده کودک.
        بند ۱۱ سرصفحه — حذف واقعی ممنوع است، و دکمه‌ای که بعداً
        «نمی‌شود» بگوید بدتر از نبودنش است.
      */}
      <p className="menu-foot t-caption">
        <span aria-hidden><AlertIcon size={14} /></span>{' '}
        برای خروج از حساب، کلید حساب کاربری در بالای صفحه.
      </p>
    </>
  )
}
