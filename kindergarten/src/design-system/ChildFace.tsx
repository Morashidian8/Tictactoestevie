import { AvatarFace } from './AvatarFace.tsx'
import styles from './ChildFace.module.css'

/**
 * چهره کودک، هرجا که آواتار کاملِ صفحه «امروز» لازم نیست.
 *
 * تصمیم «عکس هست یا نه» فقط اینجا و در ChildAvatar گرفته می‌شود. پیش‌تر
 * پنج صفحه مستقیم AvatarFace می‌کشیدند، پس با آمدن عکس‌ها شبکه «امروز»
 * عکس نشان می‌داد و همان کودک در فهرست ثبت گروهی چهره کشیده‌شده —
 * ناهماهنگی‌ای که هیچ دلیلی نداشت.
 */
type Props = {
  id: string
  photoUrl?: string | null
}

export function ChildFace({ id, photoUrl }: Props) {
  if (photoUrl) return <img className={styles.photo} src={photoUrl} alt="" />
  return <AvatarFace seed={id} />
}
