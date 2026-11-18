// The time of each step of a clip, in seconds from its first frame, written by
// record/inside.sh next to the clip. The edit cuts by these, so a new
// recording keeps the cuts in place.
import intro from '../public/clips/intro.json';
import search from '../public/clips/search.json';
import t3 from '../public/clips/t3.json';

export const markers = { intro, search, t3 };
export type Clip = keyof typeof markers;
