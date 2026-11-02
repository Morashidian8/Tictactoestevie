import type { Invoice, InvoiceLine } from './types.ts'

/**
 * مبلغ صورتحساب — یک تعریف، در یک جا.
 *
 * پیش از این، دوازده جای مختلف همین جمع را دستی می‌زدند و هر بار که
 * جزء تازه‌ای اضافه می‌شد (اقلام، جریمه دیرکرد) بعضی‌شان جا می‌ماندند.
 * نتیجه‌اش این بود: درگاه مبلغی کمتر از بدهی می‌گرفت، صورتحساب باز
 * می‌ماند و یادآوری برای خانواده‌ای می‌رفت که تازه پرداخت کرده بود.
 *
 * هم‌ارز `app.invoice_total` و `app.invoice_due` در پایگاه داده است.
 * اگر اجزا عوض شوند، باید هر دو با هم عوض شوند.
 */
type Billable = {
  amount: number
  discount: number
  lateFee: number
  overdueFee: number
  lines: InvoiceLine[]
}

export function invoiceTotal(invoice: Billable): number {
  return (
    invoice.amount -
    invoice.discount +
    invoice.lateFee +
    invoice.overdueFee +
    invoice.lines.reduce((sum, line) => sum + line.amount, 0)
  )
}

/** بدهی باقی‌مانده. هرگز منفی نمی‌شود — اضافه‌پرداخت، بستانکاری است نه بدهی منفی. */
export function invoiceDue(invoice: Invoice): number {
  return Math.max(invoiceTotal(invoice) - invoice.paid, 0)
}
