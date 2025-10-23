export interface TiptapDoc { type: 'doc'; content: any[]; }
export interface HtmlString extends String {}
export interface JobDoc {
  id: string;
  jobId?: string | null;
  folderId?: string | null;
  position?: number;
  title: string;
  tiptapJson?: TiptapDoc | null;
  htmlSnapshot?: string | null;
  icon?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
}
