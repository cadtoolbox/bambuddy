const getResumeButtonTooltip = () => {
  if (!hasPermission('printers:control')) {
    return t('printers.permission.noControl');
  }
  const isPausedState = status?.state === 'PAUSED' || status?.state === 'PAUSE';
  if (isPausedState && printer.part_removal_required) {
    return t('printers.partRemoval.plateCheckDisabledDuringRemoval');
  }
  return isPausedState ? t('printers.resume') : t('printers.pause');
};
