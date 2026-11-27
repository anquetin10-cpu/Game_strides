# Cœur Strides en C++ standard (20, comme Unreal) (règles de jeu portées du jeu web), compilé seul pour les tests hors moteur ; les mêmes
# sources SONT celles du module Unreal StridesGrandTour/Source/StridesCore (une seule copie). Usage :
#   cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure
cmake_minimum_required(VERSION 3.20)
project(StridesCore CXX)
set(CMAKE_CXX_STANDARD 20)  # comme Unreal 5.3+ (le code reste compatible C++17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CORE ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Source/StridesCore)
add_library(strides_core ${CORE}/Private/JumpModel.cpp ${CORE}/Private/CsoRide.cpp ${CORE}/Private/CsoCourse.cpp ${CORE}/Private/CsoHorse.cpp ${CORE}/Private/CsoFences.cpp ${CORE}/Private/LimbContact.cpp ${CORE}/Private/CsoRun.cpp ${CORE}/Private/CsoHud.cpp ${CORE}/Private/CsoCamera.cpp ${CORE}/Private/CsoInput.cpp ${CORE}/Private/CourseAids.cpp ${CORE}/Private/Text.cpp ${CORE}/Private/SaveGame.cpp ${CORE}/Private/CoursePlan.cpp ${CORE}/Private/CsoEntry.cpp ${CORE}/Private/Ranking.cpp ${CORE}/Private/CsoAudio.cpp ${CORE}/Private/HorseCoat.cpp)
target_include_directories(strides_core PUBLIC ${CORE}/Public)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(strides_core PRIVATE -Wall -Wextra -Wpedantic)
endif()
enable_testing()
add_executable(strides_core_tests tests/test_core.cpp)
target_link_libraries(strides_core_tests strides_core)
# Arguments : oracles exportés du JS, puis données lues par le jeu (Content/Data) pour tester le chemin du jeu.
# Jalon J2 : contacts des membres avec les barres (StridesCore/LimbContact, limbContact.js et pjlHorse.js _limbContacts),
# bancs « limb » (limb_contact.json) et « fences » (scénarios j2-* : pose des membres relevée dans le jeu web, canal lb).
add_test(NAME oracles COMMAND strides_core_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
# Essai de monte, voie A, étape 4 : règles de monte du web (src/entities/human/anim.js, human.js) portées en C++
# (StridesCore/RiderRules), prouvées contre l'oracle O2 (tests/oracles/monte) ; banc de coût strides_monte_bench (hors
# ctest, à compiler en Release : cmake -DCMAKE_BUILD_TYPE=Release).
target_sources(strides_core PRIVATE ${CORE}/Private/RiderRules.cpp)
add_executable(strides_monte_tests tests/test_monte.cpp)
target_link_libraries(strides_monte_tests strides_core)
add_test(NAME monte COMMAND strides_monte_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles/monte ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
add_executable(strides_monte_bench tests/bench_monte.cpp)
target_link_libraries(strides_monte_bench strides_core)
# Essai de monte, voie A, étape 5 : sellerie du cheval WildMesh (src/entities/pjlHorse.js, pjl/view.js) portée en C++
# (StridesCore/HorseTack), contre l'oracle O1 (ctest « monte-cheval ») ; cheval posé dans Unreal : Strides.Parite.HorseSeat.
target_sources(strides_core PRIVATE ${CORE}/Private/HorseTack.cpp)
# Étape M3 : phase de foulée lue par le cavalier (calage des clips, pjlHorse.js), StridesCore/HorsePhase, même ctest.
target_sources(strides_core PRIVATE ${CORE}/Private/HorsePhase.cpp)
add_executable(strides_horse_tack_tests tests/test_horse_tack.cpp)
target_link_libraries(strides_horse_tack_tests strides_core)
add_test(NAME monte-cheval COMMAND strides_horse_tack_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles/monte ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
# Essai de monte, voie A, étape 6 : cavalière Unreal montée par les règles (StridesCore/RiderPose : lecture des données,
# chaîne cheval → entrées → règle avec le retard d'une image du web, pose dans S pour le reciblage), contre O2 rider_f
# (ctest « monte-cavaliere ») ; dans le moteur : Strides.Parite.RiderRules.
target_sources(strides_core PRIVATE ${CORE}/Private/RiderPose.cpp)
add_executable(strides_rider_pose_tests tests/test_rider_pose.cpp)
target_link_libraries(strides_rider_pose_tests strides_core)
add_test(NAME monte-cavaliere COMMAND strides_rider_pose_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles/monte ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
# Essai de monte, voie A, étape 7 : statistiques du mode de mesure du coût (-StridesShots=perf : médiane, 95e centile,
# dispersion des médianes entre passes), StridesCore/PerfStats ; ctest « perf ».
target_sources(strides_core PRIVATE ${CORE}/Private/PerfStats.cpp)
add_executable(strides_perf_tests tests/test_perf_stats.cpp)
target_link_libraries(strides_perf_tests strides_core)
add_test(NAME perf COMMAND strides_perf_tests)
# Essai de monte, voie A, étape M2 : clips miroir du cheval WildMesh (pjl/asset.js bakeMirror) et main au galop
# (horse/anim.js, pjl/view.js) portés en C++ (StridesCore/HorseMirror), contre l'oracle miroir exporté du jeu web
# (tests/oracles/monte/miroir, scripts/unreal/export-horse-mirror.mjs) et O1 (ctest « monte-miroir ») ; dans le moteur :
# Strides.Parite.HorseMirror.
target_sources(strides_core PRIVATE ${CORE}/Private/HorseMirror.cpp)
add_executable(strides_horse_mirror_tests tests/test_horse_mirror.cpp)
target_link_libraries(strides_horse_mirror_tests strides_core)
add_test(NAME monte-miroir COMMAND strides_horse_mirror_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles/monte ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
# Étape S1 (sellerie complète) : étriers, étrivières et rênes du cheval WildMesh (pjlHorse.js Strap, _straps ; horse.js
# _stirrupsFollow) portés en C++ (StridesCore/HorseStraps), contre l'oracle sellerie/ exporté du jeu web
# (scripts/unreal/export-rider-rules.mjs --sellerie) et O1 (ctest « monte-sellerie ») ; dans le moteur :
# Strides.Parite.HorseTackMesh.
target_sources(strides_core PRIVATE ${CORE}/Private/HorseStraps.cpp)
add_executable(strides_horse_straps_tests tests/test_horse_straps.cpp)
target_link_libraries(strides_horse_straps_tests strides_core)
add_test(NAME monte-sellerie COMMAND strides_horse_straps_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles/monte ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
# Étape S4 (inclinaison en virage, corps et horloge du saut) : vue du cheval WildMesh (pjl/view.js update, pjlHorse.js
# _snapshot, _jumpTime, _pushContact, _barNeed, _limbTuck, _barClear ; horse/anim.js : allure, main, phase) portée en C++
# (StridesCore/HorseView), contre l'oracle vue/ exporté du jeu web (scripts/unreal/export-rider-rules.mjs --vue)
# (ctest « monte-vue ») ; dans le moteur : Strides.Parite.HorseView.
target_sources(strides_core PRIVATE ${CORE}/Private/HorseView.cpp)
add_executable(strides_horse_view_tests tests/test_horse_view.cpp)
target_link_libraries(strides_horse_view_tests strides_core)
add_test(NAME monte-vue COMMAND strides_horse_view_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles/monte ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Content/Data)
# Jalon J1 (correction après contrôle) : collisions du monde (src/world/colliders.js, clôture de la carrière du Pôle,
# ailes des obstacles, résolution du cheval de horse.js) portées en C++ (StridesCore/Colliders), contre l'oracle
# tests/oracles/colliders.json (scripts/unreal/export-colliders.mjs) ; ctest « colliders ».
target_sources(strides_core PRIVATE ${CORE}/Private/Colliders.cpp)
add_executable(strides_colliders_tests tests/test_colliders.cpp)
target_link_libraries(strides_colliders_tests strides_core)
add_test(NAME colliders COMMAND strides_colliders_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles)
# Jalon J1 (2e correction) : guidage qui contourne obstacles, ailes et lice (StridesCore/CsoGuide, choix du portage) ;
# ctest « guidage » sur la carrière et les obstacles de l'oracle colliders.json.
target_sources(strides_core PRIVATE ${CORE}/Private/CsoGuide.cpp)
add_executable(strides_guide_tests tests/test_guide.cpp)
target_link_libraries(strides_guide_tests strides_core)
add_test(NAME guidage COMMAND strides_guide_tests ${CMAKE_CURRENT_SOURCE_DIR}/tests/oracles)
# J1b (contrôle adverse) : recalage de la position d'une fenêtre plein écran connue de l'interface (StridesCore/WindowFit,
# choix du portage : premier clic sur les cartes en paquet Mac) ; ctest « fenetre ».
target_sources(strides_core PRIVATE ${CORE}/Private/WindowFit.cpp)
add_executable(strides_window_fit_tests tests/test_window_fit.cpp)
target_link_libraries(strides_window_fit_tests strides_core)
add_test(NAME fenetre COMMAND strides_window_fit_tests)
