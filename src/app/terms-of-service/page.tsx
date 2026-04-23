import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Claw AI",
  description: "Claw AI Terms of Service. Read the terms and conditions governing your use of our AI agent platform.",
};

export default function TermsOfService() {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 23, 2026</p>

        <p className="mb-6 text-foreground/80">
          Welcome to Claw AI. These Terms of Service (&quot;Terms&quot;) govern your access to and use of our AI agent platform and all related services, tools, and features (collectively, the &quot;Service&quot;). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">1. Description of Service</h2>
        <p className="mb-6 text-foreground/80">
          Claw AI is a multi-agent artificial intelligence platform that provides conversational AI capabilities, web research, code execution, document generation, data analysis, and workflow automation. The Service orchestrates multiple specialist AI agents to fulfill user requests through natural language interactions. The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">2. Account &amp; Authentication</h2>
        <p className="mb-4 text-foreground/80">To use certain features of the Service, you must authenticate through an OAuth provider (e.g., Google). You are responsible for maintaining the security of your OAuth account credentials. You agree to:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li>Provide accurate and complete information during authentication</li>
          <li>Maintain the security of your authentication credentials</li>
          <li>Immediately notify us of any unauthorized use of your account</li>
          <li>Accept responsibility for all activities that occur under your account</li>
        </ul>
        <p className="mb-6 text-foreground/80">We reserve the right to suspend or terminate accounts that violate these Terms.</p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">3. Acceptable Use</h2>
        <p className="mb-4 text-foreground/80">You agree to use the Service only for lawful purposes and in accordance with these Terms. You shall not:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li>Use the Service to generate, distribute, or facilitate harmful, illegal, fraudulent, or abusive content</li>
          <li>Attempt to reverse engineer, decompile, disassemble, or otherwise exploit the Service&apos;s source code or underlying technology</li>
          <li>Interfere with or disrupt the Service&apos;s infrastructure, servers, or networks</li>
          <li>Use automated systems, bots, or scraping tools to access the Service without authorization</li>
          <li>Attempt to gain unauthorized access to other users&apos; accounts, data, or systems</li>
          <li>Use the Service to violate any applicable local, state, national, or international law or regulation</li>
          <li>Generate content that infringes on the intellectual property rights of others</li>
          <li>Overload the Service&apos;s infrastructure through excessive or abusive usage patterns</li>
          <li>Use the Service to send unsolicited bulk communications (spam)</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">4. Third-Party Integrations</h2>
        <p className="mb-6 text-foreground/80">
          The Service may integrate with third-party services such as Google Workspace (Gmail, Calendar, Drive, Sheets, Docs), web search engines, financial data providers, and AI model APIs. Your use of these integrations is subject to both these Terms and the third-party service&apos;s own terms of service and privacy policy. We are not responsible for the practices, policies, or actions of third-party services.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">5. Code Execution &amp; Sandbox</h2>
        <p className="mb-4 text-foreground/80">The Service may execute code in sandboxed environments on your behalf. You acknowledge that:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li>Code execution occurs in isolated environments with limited resources and time constraints</li>
          <li>You are solely responsible for the code you request to be executed</li>
          <li>We are not liable for any unintended consequences, errors, or outputs from code execution</li>
          <li>Sandboxed environments are temporary and data is not persisted between executions</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">6. AI-Generated Content</h2>
        <p className="mb-4 text-foreground/80">The Service generates content using artificial intelligence models. You acknowledge that:</p>
        <ul className="list-disc pl-6 space-y-2 mb-6 text-foreground/80">
          <li>AI-generated content may contain inaccuracies, errors, or hallucinations</li>
          <li>You should independently verify any AI-generated information before relying on it for critical decisions</li>
          <li>You bear responsibility for reviewing and validating any documents, code, or analysis generated by the Service</li>
          <li>AI-generated content does not constitute professional advice (legal, medical, financial, or otherwise)</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">7. Intellectual Property</h2>
        <p className="mb-6 text-foreground/80">
          The Service and its original content, features, and functionality (excluding content provided by you or third-party services) are owned by Claw AI and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. Content you create through the Service belongs to you. You grant us a limited, non-exclusive license to process, store, and deliver your content as necessary to provide the Service.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">8. Limitation of Liability</h2>
        <p className="mb-6 text-foreground/80">
          To the fullest extent permitted by applicable law, Claw AI and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses, resulting from: (a) your access to or use of, or inability to access or use, the Service; (b) any content, code, or documents generated by the Service; (c) unauthorized access to or alteration of your data; or (d) any other matter relating to the Service. In no event shall our total liability exceed the amount you have paid to us in the twelve months preceding the claim.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">9. Disclaimer of Warranties</h2>
        <p className="mb-6 text-foreground/80">
          The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without any warranties of any kind, whether express, implied, statutory, or otherwise. We expressly disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement. We make no warranty that the Service will be uninterrupted, timely, secure, or error-free.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">10. Termination</h2>
        <p className="mb-6 text-foreground/80">
          We reserve the right to terminate or suspend your access to the Service at any time, with or without cause, and with or without notice. Upon termination, your right to use the Service will immediately cease. Provisions that by their nature should survive termination shall remain in effect.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">11. Changes to These Terms</h2>
        <p className="mb-6 text-foreground/80">
          We reserve the right to modify or replace these Terms at any time. Material changes will be posted on this page with an updated &quot;Last updated&quot; date. Your continued use of the Service after any changes to these Terms constitutes acceptance of the new Terms.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">12. Governing Law</h2>
        <p className="mb-6 text-foreground/80">
          These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles. Any disputes arising from or relating to these Terms or the Service shall be resolved through good-faith negotiation or, if necessary, through binding arbitration.
        </p>

        <h2 className="text-xl font-semibold text-foreground mt-10 mb-4">13. Contact</h2>
        <p className="text-foreground/80">
          If you have any questions about these Terms of Service, please contact us at: <strong>legal@clawai.dev</strong>
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
