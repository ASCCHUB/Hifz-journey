import Link from "next/link";
import PersonalizedJourney from "@/components/PersonalizedJourney";
import TeachingPrefs from "@/components/TeachingPrefs";
import LearnViewSetting from "@/components/LearnViewSetting";
import SettingsGroup from "@/components/SettingsGroup";

export default function JourneySettingsPage() {
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-muted">Changing a goal keeps all past evidence and lesson history.</p>
    <section aria-label="My Hifz Goal"><h2 className="label mb-2">My Hifz Goal</h2><PersonalizedJourney /></section>
    <SettingsGroup id="teaching" title="Teaching Preferences" summary="Guided or manual, level, portion size, Ayah or Mushaf view">
      <TeachingPrefs />
      <LearnViewSetting />
    </SettingsGroup>
    <Link href="/profile#reminders" className="card flex min-h-[56px] items-center justify-between gap-3 text-ink no-underline hover:border-accent"><span><span className="block font-semibold">Reminders</span><span className="block text-sm text-muted">Hifz and revision notifications are in Settings</span></span><span aria-hidden="true" className="text-xl text-muted">›</span></Link>
  </div>;
}
