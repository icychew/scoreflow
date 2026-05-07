import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getMonthlyUsage, getAnonymousUsage, canTranscribeSync } from "@/lib/usage";
import UsageBanner from "@/components/UsageBanner";
import UpgradePrompt from "@/components/UpgradePrompt";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notara — Upload Audio & Get Sheet Music",
  description:
    "Drag and drop any MP3, WAV, or FLAC. Notara's AI transcribes your audio to sheet music and delivers a PDF score in seconds. Free to try.",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const tier = session?.user?.tier ?? "free";

  let used = 0;
  if (session?.user?.id) {
    used = await getMonthlyUsage(session.user.id);
  } else {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("notara_session")?.value;
    if (sessionToken) {
      used = await getAnonymousUsage(sessionToken);
    }
  }

  const canTranscribe = canTranscribeSync(tier, used);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <UsageBanner used={used} tier={tier} />
      {canTranscribe ? children : <UpgradePrompt />}
    </div>
  );
}
