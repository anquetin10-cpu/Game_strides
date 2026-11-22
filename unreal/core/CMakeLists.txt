# Cœur Strides en C++ standard (20, comme Unreal) (règles de jeu portées du jeu web), compilé seul pour les tests hors moteur ; les mêmes
# sources SONT celles du module Unreal StridesGrandTour/Source/StridesCore (une seule copie). Usage :
#   cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure
cmake_minimum_required(VERSION 3.20)
project(StridesCore CXX)
set(CMAKE_CXX_STANDARD 20)  # comme Unreal 5.3+ (le code reste compatible C++17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CORE ${CMAKE_CURRENT_SOURCE_DIR}/../StridesGrandTour/Source/StridesCore)
add_library(strides_core ${CORE}/Private/JumpModel.cpp ${CORE}/Private/CsoRide.cpp ${CORE}/Private/CsoCourse.cpp ${CORE}/Private/CsoHorse.cpp ${CORE}/Private/CsoFences.cpp ${CORE}/Private/CsoRun.cpp ${CORE}/Private/CsoHud.cpp ${CORE}/Private/CsoCamera.cpp ${CORE}/Private/CsoInput.cpp ${CORE}/Private/CourseAids.cpp ${CORE}/Private/Text.cpp ${CORE}/Private/SaveGame.cpp ${CORE}/Private/CoursePlan.cpp ${CORE}/Private/CsoEntry.cpp ${CORE}/Private/Ranking.cpp ${CORE}/Private/CsoAudio.cpp ${CORE}/Private/HorseCoat.cpp)
target_include_directories(strides_core PUBLIC ${CORE}/Public)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(strides_core PRIVATE -Wall -Wextra -Wpedantic)
endif()
enable_testing()
add_executable(strides_core_tests tests/test_core.cpp)
target_link_libraries(strides_core_tests strides_core)
# Arguments : oracles exportés du JS, puis données lues par le jeu (Content/Data) pour tester le chemin du jeu.
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
