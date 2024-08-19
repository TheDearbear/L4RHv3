/** Settings for configuring behaivour of library */
export default class Settings {
    /** Fields with type `pointer` will be 64 bit length instead of 32 */
    public pointersAre64Bits: Boolean = false;
    /** Minimal size (in bytes) of chunk's data required to compress it */
    public compressThreshold: number = 150;
    /** Forces `ChunkDataRecoding.decode` to write padding fields to output JSON */
    public exportPaddings: Boolean = false;
};
