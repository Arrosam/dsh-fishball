import { RECOMMENDATION_TEST_DATA, registerRecommendationCases } from './cases.mjs';

// Independent registration: no execution or result is borrowed from the other SDK.
registerRecommendationCases(RECOMMENDATION_TEST_DATA.sdks.rc1);
