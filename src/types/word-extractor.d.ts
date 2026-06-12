declare module "word-extractor" {
  type WordExtractorDocument = {
    getAnnotations(): string;
    getBody(): string;
    getEndnotes(): string;
    getFooters(): string;
    getFootnotes(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getTextboxes(options?: {
      includeBody?: boolean;
      includeHeadersAndFooters?: boolean;
    }): string;
  };

  export default class WordExtractor {
    extract(input: Buffer | string): Promise<WordExtractorDocument>;
  }
}
