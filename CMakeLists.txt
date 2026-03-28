cmake_minimum_required(VERSION 3.16)

project(orbit_deepin_assistant VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)

find_package(QT NAMES Qt6 Qt5 REQUIRED COMPONENTS Core Gui Widgets Network)
find_package(Qt${QT_VERSION_MAJOR} REQUIRED COMPONENTS Core Gui Widgets Network)

add_executable(orbit_deepin_assistant
    src/main.cpp
    src/MainWindow.cpp
    src/MainWindow.h
    src/FloatingLauncher.cpp
    src/FloatingLauncher.h
    src/ContextCollector.cpp
    src/ContextCollector.h
    src/EmailComposer.cpp
    src/EmailComposer.h
    src/DiagnosticsService.cpp
    src/DiagnosticsService.h
    src/ActionExecutor.cpp
    src/ActionExecutor.h
    src/CommandRunner.cpp
    src/CommandRunner.h
    resources/app.qrc
)

target_compile_definitions(orbit_deepin_assistant PRIVATE ORBIT_SOURCE_DIR="${CMAKE_SOURCE_DIR}")

target_link_libraries(orbit_deepin_assistant PRIVATE
    Qt${QT_VERSION_MAJOR}::Core
    Qt${QT_VERSION_MAJOR}::Gui
    Qt${QT_VERSION_MAJOR}::Widgets
    Qt${QT_VERSION_MAJOR}::Network
)

if(QT_VERSION_MAJOR EQUAL 6)
    qt_finalize_executable(orbit_deepin_assistant)
endif()

install(TARGETS orbit_deepin_assistant RUNTIME DESTINATION bin)
install(FILES README.md DESTINATION share/orbit-deepin-assistant OPTIONAL)
install(FILES packaging/orbit-deepin-assistant.desktop
        DESTINATION share/applications)
install(FILES assets/orbit-deepin-assistant.svg
        DESTINATION share/icons/hicolor/scalable/apps)

set(CPACK_PACKAGE_NAME "orbit-deepin-assistant")
set(CPACK_PACKAGE_VENDOR "guanzi008")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_GENERATOR "TGZ")
include(CPack)
