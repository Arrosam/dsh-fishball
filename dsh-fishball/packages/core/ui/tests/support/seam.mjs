/**
 * The fishball-core / fishball-ui seam values: the contract oracle of fishball-ui's tests, read from
 * fishball-shared/ui-seam itself. fishball-ui reads the seam by name at runtime; it is a nested package
 * of fishball-core, whose manifest declares fishball-shared, so the independence check allows the
 * name here (fishball-test-helpers/packages: a nested package may use its parent's dependencies).
 */
export * from 'fishball-shared/ui-seam'
