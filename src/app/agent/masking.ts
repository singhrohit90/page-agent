/** Data-masking hook (transformPageContent): hides email addresses before page text reaches the model. */
export function maskEmails(content: string): string {
	return content.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[masked-email]')
}
