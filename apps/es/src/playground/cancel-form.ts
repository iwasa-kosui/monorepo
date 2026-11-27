export const targetVisitId = 'visit-pochi';
export const operatorName = '受付スタッフ';
export const cancelReasons = ['飼い主の都合', '来院前に回復したため'] as const;
export const defaultReason: string = cancelReasons[0];

export const cancelInputSource = (reason: string): string =>
  `export const cancelInput = ${JSON.stringify({ visitId: targetVisitId, reason, operatedBy: operatorName })};\n`;

export const statusLabels: Readonly<Record<string, string>> = {
  reserved: '予約済み',
  checked_in: '受付済み',
  completed: '診察済み',
  cancelled: 'キャンセル済み',
};

export const statusLabelOf = (status: string): string => statusLabels[status] ?? status;
