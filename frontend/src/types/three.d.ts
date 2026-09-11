declare module 'three' {
  export const LinearFilter: number

  export class CanvasTexture {
    minFilter: number
    magFilter: number
    needsUpdate: boolean
    constructor(image: CanvasImageSource)
  }

  export class SpriteMaterial {
    constructor(parameters?: Record<string, unknown>)
  }

  export class Object3D {
    position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
    renderOrder: number
  }

  export class Sprite extends Object3D {
    scale: { set: (x: number, y: number, z: number) => void }
    constructor(material?: SpriteMaterial)
  }
}
