/**
 * PollTimer - Voting Deadline Countdown
 *
 * Reads getDeployTimeAndDuration() from the Poll contract
 * and shows a live countdown to the voting deadline.
 */

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface PollTimerProps {
  pollAddress: `0x${string}`;
  onExpired?: () => void;
}

export function PollTimer({ pollAddress, onExpired }: PollTimerProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const { data: timeData } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getDeployTimeAndDuration',
  });

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timeData) return null;

  const deployTime = Number((timeData as [bigint, bigint])[0]);
  const duration = Number((timeData as [bigint, bigint])[1]);
  const deadline = deployTime + duration;
  const remaining = deadline - now;

  // Notify parent when timer reaches zero
  useEffect(() => {
    if (remaining <= 0 && onExpired) {
      onExpired();
    }
  }, [remaining <= 0, onExpired]);

  if (remaining <= 0) {
    return (
      <div className="poll-timer ended" role="timer" aria-label={t.timer.ended}>
        <span className="timer-icon">\u23F0</span>
        <span className="timer-text">{t.timer.ended}</span>
      </div>
    );
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="poll-timer active" role="timer" aria-live="polite">
      <span className="timer-icon">\u23F3</span>
      <span className="timer-text">{t.timer.remaining}</span>
      <span className="timer-countdown">
        {hours > 0 && `${hours}${t.timer.hours} `}
        {pad(minutes)}{t.timer.minutes} {pad(seconds)}{t.timer.seconds}
      </span>
    </div>
  );
}
