// Stable circuit order for existing physics/regression scenarios. Production
// newCareer shuffles; season-order.test.js exercises that public behaviour.
import {newCareer as createCareer} from '../src/core.js';
import {WEEKENDS} from '../src/calendar.js';
export const newCareer=profile=>createCareer(profile,{seasonOrder:WEEKENDS.map(w=>w.track)});
