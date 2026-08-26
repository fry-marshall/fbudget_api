
export interface MailContext {
    code?: string,
    name?: string,
}

export interface MailOptions {
    receiver?: string;
    template?: string;
    subject?: string;
    context?: MailContext
}