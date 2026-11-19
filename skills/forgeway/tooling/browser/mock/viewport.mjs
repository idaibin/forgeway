export function parseViewport(value) {
  if (value === undefined) return { width: 1920, height: 1080 };
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(value)) {
    throw new Error('--viewport must be WIDTHxHEIGHT, with each dimension 100–8192');
  }
  const [width, height] = value.split('x').map(Number);
  if (width < 100 || width > 8192 || height < 100 || height > 8192) {
    throw new Error('--viewport dimensions must each be 100–8192');
  }
  return { width, height };
}
