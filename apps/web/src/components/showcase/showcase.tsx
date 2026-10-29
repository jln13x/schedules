import { SkillCard } from "./skill-card";
import type { ShowcaseSkill } from "./showcase-skills";

const CARD_MS = 3600;
const FADE_MS = 350;

/**
 * Every card is rendered on top of the others, so the block is as tall as the tallest card and
 * never moves the layout below it. One CSS animation per card fades it in during its share of
 * the cycle; nothing runs in JavaScript.
 */
export function Showcase({ skills }: { skills: ReadonlyArray<ShowcaseSkill> }) {
  if (skills.length === 0) {
    return null;
  }

  const cycleMs = skills.length * CARD_MS;
  const percent = (ms: number) => `${((ms / cycleMs) * 100).toFixed(3)}%`;
  return (
    <div className="grid">
      <style href="showcase" precedence="default">
        {`@keyframes showcase{0%{opacity:0;transform:translateY(12px)}${percent(FADE_MS)},${percent(CARD_MS - FADE_MS)}{opacity:1;transform:none}${percent(CARD_MS)},100%{opacity:0;transform:translateY(-12px)}}`}
      </style>
      {skills.map((skill, index) => (
        <div
          key={skill.key}
          aria-hidden={index > 0 || undefined}
          className="[grid-area:1/1]"
          style={{
            animation: `showcase ${cycleMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${index * CARD_MS}ms infinite both`,
          }}
        >
          <SkillCard skill={skill} />
        </div>
      ))}
    </div>
  );
}
