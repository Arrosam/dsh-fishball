import { RECOMMENDATION_TEST_DATA, registerRecommendationCases } from './cases.mjs';

// Independent registration: no execution or result is borrowed from the other SDK.
await registerRecommendationCases(RECOMMENDATION_TEST_DATA.sdks.rc5);
await (await import('./review-checks.mjs')).registerReviewCases(RECOMMENDATION_TEST_DATA.sdks.rc5);
