// A page model's `form` field is `null` when no form is open. Update sites need to derive a
// patch from the current form but leave the model untouched while the form is closed. `withForm`
// captures that guard once instead of repeating `form === null ? model : evo(model, { form: ... })`
// at every call site.
export const withForm = <M extends { readonly form: unknown }>(
  model: M,
  patch: (form: NonNullable<M['form']>) => Partial<NonNullable<M['form']>>
): M => {
  if (model.form === null || model.form === undefined) {
    return model
  }
  return { ...model, form: { ...model.form, ...patch(model.form) } }
}
