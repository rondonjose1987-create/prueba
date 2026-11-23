import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BLUEPRINT_LIMITS, type AbonoEntry, type MolassesDispatch, type UnitType } from '../types/molasses';

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatIsoDateShort(iso: string): string {
  if (!iso || !BLUEPRINT_LIMITS.DATE_REGEX.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatUsd(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `$${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBs(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Bs.V`;
}

export function formatRate(rate: number): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  return `${safe.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Bs/$`;
}

export function formatQty(quantity: number, unit: UnitType): string {
  const safe = Number.isFinite(quantity) ? quantity : 0;
  const formatted = safe.toLocaleString('es-VE', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${unit === 'litros' ? 'Lts' : 'Kg'}`;
}

export function generateSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'id';
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${cleanPrefix}_${rand}`.slice(0, BLUEPRINT_LIMITS.ID_MAX);
}

export function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, BLUEPRINT_LIMITS.EMAIL_MAX);
}

export function computeDispatchTotals(totalUsd: number, abonos: AbonoEntry[]): {
  hasAbono: boolean;
  totalPaidUsd: number;
  remainingUsd: number;
  status: 'pendiente' | 'abonando' | 'pagado';
} {
  const safeTotal = Math.max(0.01, round2(totalUsd));
  const totalPaid = round2(
    abonos.reduce((acc, item) => acc + Math.max(0, Number(item.amountUsd) || 0), 0)
  );
  const remaining = Math.max(0, round2(safeTotal - totalPaid));
  const hasAbono = totalPaid > 0;
  const status =
    remaining <= 0.009
      ? 'pagado'
      : totalPaid > 0
      ? 'abonando'
      : 'pendiente';
  return {
    hasAbono,
    totalPaidUsd: totalPaid,
    remainingUsd: remaining,
    status,
  };
}

export function buildDispatchSummaryText(dispatch: MolassesDispatch, farmName: string, currentRate: number): string {
  const abonoLines = dispatch.abonos
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(
      (a) =>
        `  - Abono ${a.slot} (${formatIsoDateShort(a.date)}): ${formatUsd(a.amountUsd)} (${formatBs(a.amountBs)} @ ${formatRate(a.exchangeRateBs)})${a.note ? ` [${a.note}]` : ''}`
    );

  const remainingBsToday = round2(dispatch.remainingUsd * currentRate);

  return [
    `RESUMEN DE DESPACHO DE MELAZA — ${farmName}`,
    `Fecha de venta: ${formatIsoDateShort(dispatch.saleDate)}`,
    `Persona: ${dispatch.personName}`,
    `Cantidad: ${formatQty(dispatch.quantity, dispatch.unit)}`,
    `Capital inicial: ${formatUsd(dispatch.totalUsd)} / ${formatBs(dispatch.totalBs)} (Tasa ref. del día: ${formatRate(dispatch.exchangeRateBs)})`,
    `¿Abonó?: ${dispatch.hasAbono ? 'Sí' : 'No'}`,
    ...(abonoLines.length > 0 ? ['Detalle de abonos:', ...abonoLines] : ['Detalle de abonos: Sin abonos registrados']),
    `Total abonado: ${formatUsd(dispatch.totalPaidUsd)}`,
    `Saldo restante: ${formatUsd(dispatch.remainingUsd)} (${formatBs(remainingBsToday)} a tasa actual ${formatRate(currentRate)})`,
    dispatch.notes ? `Notas: ${dispatch.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildGmailComposeUrl(toEmail: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: toEmail,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function buildDispatchesCsvString(
  dispatches: MolassesDispatch[],
  currentRate: number
): string {
  const abonoCount = Math.max(
    10,
    ...dispatches.map((d) => d.abonos.reduce((max, a) => Math.max(max, a.slot), 0))
  );

  const headers = [
    'Fecha Venta',
    'Persona',
    'Cantidad',
    'Unidad',
    'Precio Unit. USD',
    'Capital Inicial USD',
    'Tasa Ref. Bs/$',
    'Capital Inicial Bs.V',
    'Abono?',
    ...Array.from({ length: abonoCount }, (_, i) => [
      `Abono ${i + 1} USD`,
      `Abono ${i + 1} Fecha`,
      `Abono ${i + 1} Bs.V`,
    ]).flat(),
    'Total Abonado USD',
    'Saldo Restante USD',
    'Restante Bs.V (Tasa Actual)',
    'Estado',
    'Notas',
  ];

  const escapeCsv = (val: string | number): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = dispatches.map((d) => {
    const slotMap = new Map<number, AbonoEntry>();
    for (const a of d.abonos) slotMap.set(a.slot, a);

    const abonoCols: (string | number)[] = [];
    for (let s = 1; s <= abonoCount; s++) {
      const entry = slotMap.get(s);
      if (entry) {
        abonoCols.push(entry.amountUsd.toFixed(2), entry.date, entry.amountBs.toFixed(2));
      } else {
        abonoCols.push('', '', '');
      }
    }

    return [
      d.saleDate,
      d.personName,
      d.quantity,
      d.unit,
      d.unitPriceUsd.toFixed(2),
      d.totalUsd.toFixed(2),
      d.exchangeRateBs.toFixed(2),
      d.totalBs.toFixed(2),
      d.hasAbono ? 'Sí' : 'No',
      ...abonoCols,
      d.totalPaidUsd.toFixed(2),
      d.remainingUsd.toFixed(2),
      round2(d.remainingUsd * currentRate).toFixed(2),
      d.status.toUpperCase(),
      d.notes || '',
    ].map(escapeCsv);
  });

  return (
    '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\n')
  );
}

export async function saveAndShareTextFile(
  filename: string,
  content: string,
  mimeType: string,
  shareTitle: string
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: shareTitle,
      url: result.uri,
      dialogTitle: shareTitle,
    });
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function shareTextNatively(
  title: string,
  text: string
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({
      title,
      text,
      dialogTitle: title,
    });
    return true;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function exportDispatchesToCsv(
  dispatches: MolassesDispatch[],
  currentRate: number,
  farmName: string
): Promise<void> {
  const csvContent = buildDispatchesCsvString(dispatches, currentRate);
  const safeName = farmName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `control-melaza-${safeName}-${todayIsoDate()}.csv`;
  await saveAndShareTextFile(
    filename,
    csvContent,
    'text/csv;charset=utf-8;',
    `Reporte Melaza — ${farmName}`
  );
}
