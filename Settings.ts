import DocsManager from './DocsManager';
import Logger from './logging/Logger';
import StubLogger from './logging/StubLogger';

/** Settings for configuring behaivour of library */
export default class Settings {
    /** Fields with type `pointer` will be 64 bit length instead of 32 */
    public pointersAre64Bits: Boolean = false;
    /** Minimal size (in bytes) of chunk's data required to compress it */
    public compressThreshold: number = 150;
    /** Forces `ChunkDataRecoding.decode` to write padding fields to output JSON */
    public exportPaddings: Boolean = false;
    /** Logger for piping messages */
    public logger: Logger = new StubLogger();
    /** Documentation storage for subnests */
    public docs: DocsManager = new DocsManager();
    /** Suppresses any logger warning about extra data after decoding data */
    public suppressExtraDataWarning: Boolean = false;
};
