import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Claw AI",
  description: "Claw AI Privacy Policy. Learn how we handle your data, information, and interactions with our AI agent platform.",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <a href="/" className="text-xl font-bold text-primary">
            Claw<span className="text-primary/60">AI</span>
          </a>
        </div>
      </header>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 23, 2026</p>

        <p className="mb-6 text-foreground/80">
          Claw AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI agent platform and related services (collectively, the &quot;Service&quot;). By using the Service, you agree to the collection and use of information in accordance with this policy.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">1. Information We Collect</h2>
        <p className="mb-4 text-foreground/80">We collect information that you provide directly to us when using the Service:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li><strong>Account Information:</strong> When you connect through OAuth providers (e.g., Google), we receive your name, email address, and profile picture as provided by the authentication service. We do not store passwords — authentication is handled entirely by the OAuth provider.</li>
          <li><strong>Conversation Data:</strong> Your chat messages, prompts, and interactions with our AI agents are temporarily processed to generate responses. Conversations are stored in our database to provide context continuity and conversation history.</li>
          <li><strong>Generated Content:</strong> Documents, code outputs, spreadsheets, and other content created through the Service are stored temporarily and may be delivered to you as downloadable files.</li>
          <li><strong>Usage Data:</strong> We automatically collect information about your interactions with the Service, including tool usage patterns, agent delegation logs, and system performance metrics.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">2. How We Use Your Information</h2>
        <p className="mb-4 text-foreground/80">We use the information we collect to:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li>Provide, maintain, and improve the Service and its AI agent capabilities</li>
          <li>Process your requests and generate relevant AI-powered responses</li>
          <li>Maintain conversation context across sessions for continuity</li>
          <li>Execute code in sandboxed environments on your behalf</li>
          <li>Generate documents, spreadsheets, and other deliverables you request</li>
          <li>Monitor and analyze usage patterns to improve system performance</li>
          <li>Communicate with you about the Service, including updates and support</li>
          <li>Detect, prevent, and address technical issues or security threats</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">3. Third-Party Services</h2>
        <p className="mb-4 text-foreground/80">The Service integrates with and relies on third-party services to function:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li><strong>Google OAuth:</strong> Used for user authentication. Google&apos;s privacy policy applies to data shared during authentication.</li>
          <li><strong>Google Workspace APIs:</strong> Gmail, Calendar, Drive, Sheets, and Documents APIs may be used to interact with your Google account when you explicitly request such actions through our agents. Access is granted only through OAuth consent and can be revoked at any time.</li>
          <li><strong>AI Language Models:</strong> Conversations are processed through language model APIs. Your prompts may be sent to these services to generate responses. Check the respective provider&apos;s privacy policy for their data handling practices.</li>
          <li><strong>Code Execution:</strong> Code you request to be executed is run in isolated sandbox environments. No persistent data is stored in these environments.</li>
          <li><strong>Web Search &amp; APIs:</strong> Academic search, financial data, and web scraping tools query external APIs on your behalf. These services may log requests per their own policies.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">4. Data Storage &amp; Security</h2>
        <p className="mb-6 text-foreground/80">
          Your data is stored on secure, cloud-hosted infrastructure with encryption at rest. We implement reasonable technical and organizational measures to protect your information from unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">5. Data Retention</h2>
        <p className="mb-6 text-foreground/80">
          We retain your account information and conversation history for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us. Generated files stored in temporary storage are automatically purged after a reasonable period.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">6. Your Rights &amp; Choices</h2>
        <p className="mb-4 text-foreground/80">You have the right to:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li>Access, update, or delete your personal information</li>
          <li>Revoke OAuth access permissions at any time through your Google account settings</li>
          <li>Request a copy of your data</li>
          <li>Opt out of any future communications from us</li>
          <li>Delete your account and all associated data</li>
        </ul>
        <p className="mb-6 text-foreground/80">To exercise any of these rights, please contact us at the email address provided below.</p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">7. Children&apos;s Privacy</h2>
        <p className="mb-6 text-foreground/80">
          The Service is not intended for use by individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it promptly.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">8. Changes to This Policy</h2>
        <p className="mb-6 text-foreground/80">
          We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after any changes constitutes your acceptance of the updated policy.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">9. Contact Us</h2>
        <p className="text-foreground/80">
          If you have any questions or concerns about this Privacy Policy, please contact us at: <strong>privacy@clawai.dev</strong>
        </p>
      </article>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-8">
        <div className="max-w-3xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 Claw AI. All rights reserved.</p>
          <div className="mt-2 space-x-4">
            <a href="/" className="hover:text-foreground transition-colors">Home</a>
            <a href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
