import { isValidBirthDate } from '../../../../server/src/utils/memberValidation';

/** Birth date may be unset, set, or cleared; picker enabled for admins or when editing own profile. */
export function calcAllowBirthDateInput(
  isAdminUser: boolean,
  isEditingSelf: boolean,
  _baselineBirthDateMs: number | null,
): boolean {
  return !!isAdminUser || !!isEditingSelf;
}

/** Validate only when a date is entered; empty is always allowed (not specified). */
export function getEditBirthDateFieldError(
  _baselineBirthDateMs: number | null,
  editBirthDate: Date | null,
  getRangeMessage: () => string,
): string {
  const v = editBirthDate;
  if (v && !isValidBirthDate(v)) {
    return getRangeMessage();
  }
  return '';
}
