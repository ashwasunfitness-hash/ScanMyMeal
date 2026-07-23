# Nutrition catalogue audit

- Catalogue version: `india-plant-starter-v1-2026-07-23`
- Engine version: `deterministic-household-v1`
- Reviewed/imported: 2026-07-23
- Production foods: 40
- Source: USDA FoodData Central, SR Legacy (40 records)
- Categories: fruit 9; cooked grain 5; cooked legume 9; sprout 2; vegetable 8; nut/seed 7
- Preparation states: raw 13; cooked 5; boiled 15; sprouted raw 2; dried 2; source preparation unspecified 3

## Nutrient and provenance policy

Every record uses one USDA FoodData Central SR Legacy food record. Nutrients are per 100 g edible portion: Energy (`kcal`), Protein (`g`), Carbohydrate by difference (`g`), Total lipid/fat (`g`), and Total dietary fibre (`g`). Missing required nutrients invalidate the record; missing values are never changed to zero. Source descriptions, FDC IDs, import date, food state, and FDC portion IDs are retained in production metadata.

The official ICMR-NIN Indian Food Composition Tables 2017 were considered as the preferred Indian source. This version embeds no IFCT-derived values: the selected foods are generic single foods for which USDA exposes an exact state, all five required nutrients, and compatible portion records in a machine-verifiable record. IFCT redistribution/licensing should be reviewed before embedding its data in a product; IFCT is not treated as public domain.

## Production records

All listed cup, tablespoon, teaspoon, piece, and slice weights are food-specific. `standard` is an application representation of the same source-listed measure, not a generic vessel conversion.

| Canonical food | Category/state | Source | Approved aliases | Supported conversions |
|---|---|---|---|---|
| Banana, raw | fruit/raw | FDC 173944 | banana; bananas; raw banana | piece small 101 g (93514); medium 118 g (93515); large 136 g (93516); cup 150 g (93512) |
| Apple, raw, with skin | fruit/raw | FDC 171688 | apple with skin; raw apple with skin | piece small 149 g (89194); medium 182 g (89193); large 223 g (89192); cup slices 109 g (89191) |
| Orange, raw, all commercial varieties | fruit/raw | FDC 169097 | orange; raw orange | piece small 96 g (84229); medium 131 g (84230); large 184 g (84228); cup sections 180 g (84227) |
| Guava, common, raw | fruit/raw | FDC 173044 | guava; raw guava | piece 55 g (91859); cup 165 g (91858) |
| Papaya, raw | fruit/raw | FDC 169926 | papaya; raw papaya | piece small 157 g (85694); large 781 g (85695); cup pieces 145 g (85692) |
| Mango, raw | fruit/raw | FDC 169910 | mango; raw mango fruit | piece 336 g (85652); cup pieces 165 g (85651) |
| Watermelon, raw | fruit/raw | FDC 167765 | watermelon; raw watermelon | cup diced 152 g (81933) |
| Pomegranate, raw | fruit/raw | FDC 169134 | pomegranate; raw pomegranate | piece 282 g (84310); cup arils 174 g, derived from 0.5 cup = 87 g (84309) |
| Grapes, red or green, raw | fruit/raw | FDC 174683 | green grapes; red grapes; thompson seedless grapes | piece 4.9 g, derived from 10 grapes = 49 g (94749); cup 151 g (94748) |
| Brown rice, long-grain, cooked | cooked grain/cooked | FDC 169704 | brown rice; brown rice cooked; cooked brown rice | cup 202 g (85378) |
| White rice, long-grain, cooked | cooked grain/cooked | FDC 168878 | cooked long grain white rice; cooked white rice; white rice cooked | cup 158 g (83928) |
| Oats, cooked with water, without salt | cooked grain/cooked | FDC 173905 | cooked oats; oatmeal cooked with water; oats cooked with water | cup 234 g (93456); tablespoon 14.6 g (93457) |
| Quinoa, cooked | cooked grain/cooked | FDC 168917 | cooked quinoa | cup 185 g (83990) |
| Barley, pearled, cooked | cooked grain/cooked | FDC 170285 | cooked pearled barley; pearled barley cooked | cup 157 g (86368) |
| Lentils, cooked, boiled, without salt | cooked legume/boiled | FDC 172421 | boiled lentils; cooked lentils; lentils cooked without salt | cup 198 g (90596); tablespoon 12.3 g (90597) |
| Chickpeas, cooked, boiled, without salt | cooked legume/boiled | FDC 173757 | cooked chickpeas; cooked kabuli chana; kabuli chana cooked | cup 164 g (93226) |
| Red kidney beans, cooked, boiled, without salt | cooked legume/boiled | FDC 175194 | cooked rajma; cooked red kidney beans; rajma cooked | cup 177 g (95822); tablespoon 11 g (95823) |
| Black beans, cooked, boiled, without salt | cooked legume/boiled | FDC 173735 | black beans cooked; cooked black beans | cup 172 g (93200) |
| Mung beans, cooked, boiled, without salt | cooked legume/boiled | FDC 174257 | cooked green gram; cooked moong; cooked mung beans; green gram cooked; moong cooked | cup 202 g (94032) |
| Pigeon peas, cooked, boiled, without salt | cooked legume/boiled | FDC 172437 | arhar cooked; cooked arhar; cooked pigeon peas; cooked toor; toor cooked | cup 168 g (90621) |
| Cowpeas, cooked, boiled, without salt | cooked legume/boiled | FDC 173759 | cooked black eyed peas; cooked cowpeas; cowpeas cooked | cup 171 g (93229) |
| Split peas, cooked, boiled, without salt | cooked legume/boiled | FDC 172429 | cooked split peas; split peas cooked | cup 196 g (90606); tablespoon 12.2 g (90607) |
| Soybeans, mature, cooked, boiled, without salt | cooked legume/boiled | FDC 174271 | cooked mature soybeans; cooked soybeans; soybeans cooked | cup 172 g (94059); tablespoon 10.7 g (94060) |
| Mung bean sprouts, raw | sprout/sprouted raw | FDC 169957 | raw moong sprouts; raw mung bean sprouts | cup 104 g (85751) |
| Alfalfa sprouts, raw | sprout/sprouted raw | FDC 168384 | raw alfalfa sprouts | cup 33 g (83001); tablespoon 3 g (83002) |
| Potato, boiled, without skin or salt | vegetable/boiled | FDC 170440 | boiled potato without skin; potato boiled without skin | piece small 125 g (86654); medium 167 g (86653); large 300 g (86652); cup 156 g from 0.5 cup = 78 g (86651) |
| Sweet potato, boiled, without skin | vegetable/boiled | FDC 168484 | boiled sweet potato without skin | piece medium 151 g (83173); cup mashed 328 g (83172) |
| Carrot, cooked, boiled, without salt | vegetable/boiled | FDC 170394 | boiled carrot; cooked carrot boiled | piece 46 g (86566); tablespoon 9.7 g (86564); cup slices 156 g from 0.5 cup = 78 g (86565) |
| Cucumber, raw, with peel | vegetable/raw | FDC 168409 | cucumber with peel; raw cucumber with peel | piece 301 g (83050); cup slices 104 g from 0.5 cup = 52 g (83049) |
| Tomato, red, ripe, raw | vegetable/raw | FDC 170457 | raw red tomato; red ripe tomato | piece small 91 g (86689), medium 123 g (86686), large 182 g (86685); slice small 15 g (86692), medium 20 g (86687), large 27 g (86690); cup 180 g (86682) |
| Spinach, cooked, boiled, without salt | vegetable/boiled | FDC 168463 | boiled spinach; cooked spinach without salt | cup 180 g (83136) |
| Cauliflower, cooked, boiled, without salt | vegetable/boiled | FDC 170397 | boiled cauliflower; cooked cauliflower without salt | cup 124 g from 0.5 cup = 62 g (86573) |
| Cabbage, cooked, boiled, without salt | vegetable/boiled | FDC 169976 | boiled cabbage; cooked cabbage without salt | cup 150 g from 0.5 cup = 75 g (85799) |
| Peanuts, raw | nut/seed/raw | FDC 172430 | raw groundnut; raw groundnuts; raw peanut | cup 146 g (90609) |
| Almonds, source preparation unspecified | nut/seed/source unspecified | FDC 170567 | almond; almonds | piece 1.2 g (86868); cup whole 143 g (86863) |
| Cashew nuts, raw | nut/seed/raw | FDC 170162 | raw cashew nuts; raw cashews | none: source lists ounces only, which the application does not accept |
| English walnuts, source preparation unspecified | nut/seed/source unspecified | FDC 170187 | english walnuts; walnuts english | cup chopped 117 g (86201) |
| Sesame seeds, whole, dried | nut/seed/dried | FDC 170150 | dried whole sesame seeds | cup 144 g (86135); tablespoon 9 g (86136) |
| Flaxseed, whole, source preparation unspecified | nut/seed/source unspecified | FDC 169414 | flax seeds whole; whole flaxseed | cup whole 168 g (84817); tablespoon whole 10.3 g (84816); teaspoon whole 3.4 g (84819) |
| Chia seeds, dried | nut/seed/dried | FDC 170554 | dried chia seeds | none: source lists ounces only, which the application does not accept |

## Intentionally unresolved coverage

- Ambiguous names: `rice`, `dal`, `curry`, `sabzi`, `chutney`, `salad`, `juice`, `sprouts`, `nuts`, and preparation-unspecified legume names.
- Prepared foods: roti/chapati, idli, dosa, poha, upma, khichdi, biryani, sambar, vegetable curry and other mixed dishes. No authoritative prepared record or fully documented recipe profile was added.
- Indian vessels: no generic katori or bowl conversion.
- Density-dependent portions: no generic handful or serving conversion.
- Candidate foods omitted because the selected source did not provide a compatible record in this reviewed set: black chickpea, black gram, cooked Indian millets, bottle gourd and prepared Indian staples.

## Known limitations

- The catalogue is a deliberately small starter, not a comprehensive Indian food database.
- All embedded values in this version are USDA SR Legacy; no IFCT values are embedded.
- USDA descriptions for almonds, English walnuts and flaxseed do not state a preparation state. They are explicitly labelled `source_unspecified`; roasted or salted aliases are not accepted.
- Cashew and chia nutrient records are retained, but their source lists only ounce measures, so current application portions remain unresolved.
- Historical results keep their persisted catalogue version and are returned before the active catalogue loads.
