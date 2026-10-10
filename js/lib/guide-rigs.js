/* Atlas rectangles and neck/shoulder anchors in the continuous puppet. */
export const GUIDE_RIGS = {
  qinglan: {
    parts:[[47,129,283,500],[347,125,324,346],[685,132,223,255],[983,313,227,343],[69,690,250,280],[358,879,198,325],[550,663,390,541],[940,699,304,497]],
    head:{width:130,height:230,neck:[.43,.66],eyes:[.30,.26,.40,.09],mouth:[.41,.39,.19,.065],expressionEyes:[.27,.29,.44,.09],expressionMouth:[.45,.39,.19,.07]},
    torso:{width:144,height:145},lower:{width:215,height:289},
    upper:{width:55,height:87},forearm:{width:60,height:106},shoulder:64,armY:214,upperPivots:[[.7,.16],[.4,.12]],
  },
  xiange: {
    parts: [[24,110,302,488],[350,154,333,333],[700,96,189,270],[982,294,217,304],[54,666,232,277],[323,871,217,320],[543,628,390,592],[938,690,300,488]],
    head: { width:126,height:204,neck:[.53,.69],eyes:[.22,.32,.58,.095],mouth:[.41,.466,.20,.065],expressionEyes:[.28,.345,.56,.095],expressionMouth:[.44,.482,.20,.07] },
    torso: { width:137,height:155 },lower:{ width:228,height:289 },
    upper: { width:53,height:87 },forearm:{ width:59,height:106 },shoulder:56,armY:214,upperPivots:[[.61,.14],[.45,.12]],
  },
  yinling: {
    parts: [[0,120,325,441],[335,147,352,287],[709,117,208,275],[1020,317,189,302],[30,684,238,278],[334,882,198,330],[551,673,400,539],[942,695,305,421]],
    head: { width:132,height:179,neck:[.48,.975],eyes:[.26,.61,.43,.105],mouth:[.405,.742,.17,.06],expressionEyes:[.28,.61,.45,.105],expressionMouth:[.425,.755,.17,.065] },
    headClip:[[0,0],[1,0],[1,.43],[.90,.55],[.89,.87],[.80,1],[.15,1],[.02,.55]],
    torso: { width:150,height:151 },lower:{width:221,height:292},
    upper:{width:52,height:87},forearm:{width:59,height:106},shoulder:60,armY:210,upperPivots:[[.51,.12],[.43,.12]],
    torsoClip:[[.34,0],[.67,0],[.83,.14],[.78,.64],[.95,1],[.05,1],[.23,.64],[.17,.14]],
  },
};
