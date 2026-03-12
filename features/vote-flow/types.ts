export type VoteCardPhoto = {
  id: number;
  url: string;
  photoIndex: number;
  voteCount: number;
};

export type VoteCardData = {
  id: number;
  title?: string | null;
  photos: VoteCardPhoto[];
  totalVotes: number;
};

export type VotePhotoStat = {
  id: number;
  percentage: number;
  voteCount: number;
};

export type VoteResultSummary = {
  percentage: number;
  voteCount: number;
  totalVotes: number;
};

export type VoteCommentItem = {
  id: number;
  userName: string;
  userAvatarUrl?: string | null;
  votedPhotoId?: number | null;
  content?: string | null;
  images?: string[] | null;
  createdAt: string | Date;
};

export type VoteCommentsData = {
  canView?: boolean;
  comments: VoteCommentItem[];
};
