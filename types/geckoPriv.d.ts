// chrome context-only DOM isInstance method
// XXX: This hackishly extends Function because there is no way to extend DOM constructors.
// Callers should manually narrow the type when needed.
// See also https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/222
interface Function {
  isInstance(obj: any): boolean;
}
