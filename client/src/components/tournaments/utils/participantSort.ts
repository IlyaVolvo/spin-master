import { TournamentParticipant } from '../../../types/tournament';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

export const getParticipantDisplayRating = (participant: TournamentParticipant): number | null => {
  return participant.playerRatingAtTime ?? participant.member.rating;
};

export const sortParticipantsByRating = (
  participants: TournamentParticipant[],
): TournamentParticipant[] => {
  return [...participants].sort((a, b) => {
    const ratingA = getParticipantDisplayRating(a);
    const ratingB = getParticipantDisplayRating(b);

    if (ratingA === null && ratingB === null) {
      const nameA = formatPlayerName(a.member.firstName, a.member.lastName, getNameDisplayOrder());
      const nameB = formatPlayerName(b.member.firstName, b.member.lastName, getNameDisplayOrder());
      return nameA.localeCompare(nameB);
    }

    if (ratingA === null) return 1;
    if (ratingB === null) return -1;
    if (ratingB !== ratingA) return ratingB - ratingA;

    const nameA = formatPlayerName(a.member.firstName, a.member.lastName, getNameDisplayOrder());
    const nameB = formatPlayerName(b.member.firstName, b.member.lastName, getNameDisplayOrder());
    return nameA.localeCompare(nameB);
  });
};

export const formatParticipantsWithRating = (participants: TournamentParticipant[]): string => {
  return sortParticipantsByRating(participants)
    .map((participant) => {
      const rating = getParticipantDisplayRating(participant);
      const name = formatPlayerName(
        participant.member.firstName,
        participant.member.lastName,
        getNameDisplayOrder(),
      );
      return `${name} (${rating ?? '—'})`;
    })
    .join(', ');
};
