import * as Function from 'effect/Function'

// Forms are objects; the intersection keeps an open form from widening to `{}`.
type OpenForm<M extends { readonly form: unknown }> = NonNullable<M['form']> & object

// A page model's `form` field is `null` when no form is open. Update sites need to derive a
// patch from the current form but leave the model untouched while the form is closed. `withForm`
// captures that guard once instead of repeating `form === null ? model : modifyFields(model, { form: ... })`
// at every call site.
export const withForm: {
  <M extends { readonly form: unknown }>(patch: (form: OpenForm<M>) => Partial<OpenForm<M>>): (model: M) => M
  <M extends { readonly form: unknown }>(model: M, patch: (form: OpenForm<M>) => Partial<OpenForm<M>>): M
} = Function.dual(
  2,
  <M extends { readonly form: unknown }>(model: M, patch: (form: OpenForm<M>) => Partial<OpenForm<M>>): M => {
    if (model.form === null || model.form === undefined) {
      return model
    }

    return { ...model, form: { ...model.form, ...patch(model.form) } }
  }
)
