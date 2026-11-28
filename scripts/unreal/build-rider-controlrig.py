"""Control Rig de monte de la cavalière actuelle (essai de monte, voie A, étape 6) : /Game/Characters/Riders/Rig/CR_StridesMonte_riderF.

Tentative du plan (plan-essai.md, étape 6) : graphe construit par RigVMController, sur le modèle de
ControlRigWorkflows/workflow_two_bone_ik.py du moteur : deux TwoBoneIKSimplePerItem de jambe (thigh, calf, foot) et deux de
bras (upperarm, lowerarm, hand), bEnableStretch faux, pôle en POSITION (PoleVectorKind Location), cibles et pôles lus sur
des repères (nulls) de la hiérarchie que le jeu poserait à chaque image.

Usage (sans interface) :
  UnrealEditor-Cmd <.uproject> -run=pythonscript -script=<racine>/scripts/unreal/build-rider-controlrig.py -unattended -nullrhi
Le script écrit son compte rendu (étapes réussies, erreur exacte) dans <racine>/build/build-rider-controlrig.json, puis
sauvegarde l'asset seulement si toutes les étapes ont réussi. Le jeu n'utilise PAS cet asset : la pose est calculée en C++
(UStridesRiderRig, repli déclaré dans unreal/docs/parite/monte/README.md) ; le compte rendu documente la tentative.
"""
import json
import os
import traceback

import unreal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
REPORT = os.path.join(ROOT, 'build', 'build-rider-controlrig.json')
PATH, NAME = '/Game/Characters/Riders/Rig', 'CR_StridesMonte_riderF'
MESH = '/Game/Characters/Riders/Female/rider_f_animated/rider_f_animated/SkeletalMeshes/Body.Body'
LIMBS = [('Jambe_G', 'thigh_l', 'calf_l', 'foot_l'), ('Jambe_D', 'thigh_r', 'calf_r', 'foot_r'),
         ('Bras_G', 'upperarm_l', 'lowerarm_l', 'hand_l'), ('Bras_D', 'upperarm_r', 'lowerarm_r', 'hand_r')]
log = {'asset': PATH + '/' + NAME, 'steps': [], 'ok': False}


def step(name, value=True):
    log['steps'].append({'step': name, 'result': str(value)[:300]})
    if value is None or value is False:
        raise RuntimeError(f'étape en échec : {name} ({value})')
    return value


try:
    mesh = step('maillage de la cavalière', unreal.load_asset(MESH))
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    if unreal.EditorAssetLibrary.does_asset_exist(PATH + '/' + NAME):
        bp = step('asset existant', unreal.load_asset(PATH + '/' + NAME))
    else:
        bp = step('création de l’asset', tools.create_asset(NAME, PATH, unreal.ControlRigBlueprint, unreal.ControlRigBlueprintFactory()))
    hc = step('contrôleur de hiérarchie', bp.get_hierarchy_controller())
    step('import des os du maillage', hc.import_bones_from_asset(MESH, 'None', True, False, True))
    step('maillage d’aperçu', bp.set_preview_mesh(mesh) or True)
    rvm = step('contrôleur du graphe', bp.get_controller_by_name('RigVMModel'))
    begin = None
    for n in rvm.get_graph().get_nodes():
        if 'BeginExecution' in n.get_node_title() or 'Forwards Solve' in n.get_node_title():
            begin = n
    log['nodes'] = [n.get_name() for n in rvm.get_graph().get_nodes()]
    if begin is None:  # asset neuf : graphe vide, nœud d'exécution ajouté
        begin = rvm.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_BeginExecution', 'Execute', unreal.Vector2D(0, 0), 'BeginExecution')
    step('nœud d’exécution (Forwards Solve)', begin)
    prev = begin.find_pin('ExecuteContext').get_pin_path()
    x = 400
    for label, a, b, c in LIMBS:
        # Cibles et pôles : repères (« nulls ») de la hiérarchie, posés par le jeu à chaque image. Les variables membres
        # FVector (add_member_variable) font échouer une assertion du moteur 5.8 (RigVMExternalVariable.cpp:280,
        # CPPTypeObject), constaté le 23/11/2026 : l'éditeur s'arrête.
        for var in ('Cible_' + label, 'Pole_' + label):
            step('repère ' + var, hc.add_null(var, unreal.RigElementKey(), unreal.Transform(), False))
        node = step('nœud ' + label, rvm.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_TwoBoneIKSimplePerItem', 'Execute', unreal.Vector2D(x, 0), 'IK_' + label))
        p = node.get_name()
        step(label + ' ItemA', rvm.set_pin_default_value(p + '.ItemA', f'(Type=Bone,Name="{a}")', True))
        step(label + ' ItemB', rvm.set_pin_default_value(p + '.ItemB', f'(Type=Bone,Name="{b}")', True))
        step(label + ' EffectorItem', rvm.set_pin_default_value(p + '.EffectorItem', f'(Type=Bone,Name="{c}")', True))
        step(label + ' bEnableStretch faux', rvm.set_pin_default_value(p + '.bEnableStretch', 'False', True))
        step(label + ' pôle en position', rvm.set_pin_default_value(p + '.PoleVectorKind', 'Location', True))
        gt = step('lecture ' + label, rvm.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_GetTransform', 'Execute', unreal.Vector2D(x - 250, 200), 'Get_Cible_' + label))
        gp = step('lecture pôle ' + label, rvm.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_GetTransform', 'Execute', unreal.Vector2D(x - 250, 320), 'Get_Pole_' + label))
        step('repère cible ' + label, rvm.set_pin_default_value(gt.get_name() + '.Item', f'(Type=Null,Name="Cible_{label}")', True))
        step('repère pôle ' + label, rvm.set_pin_default_value(gp.get_name() + '.Item', f'(Type=Null,Name="Pole_{label}")', True))
        step('lien cible ' + label, rvm.add_link(gt.get_name() + '.Transform', p + '.Effector'))
        step('lien pôle ' + label, rvm.add_link(gp.get_name() + '.Transform.Translation', p + '.PoleVector'))
        step('lien d’exécution ' + label, rvm.add_link(prev, p + '.ExecuteContext'))
        prev = p + '.ExecuteContext'
        x += 400
    # Vérification relue dans le graphe : étirement désactivé sur les quatre nœuds.
    for label, *_ in LIMBS:
        v = rvm.get_graph().find_node('IK_' + label).find_pin('bEnableStretch').get_default_value()
        step('relu : IK_' + label + '.bEnableStretch = ' + v, v == 'False')
    step('compilation', bp.recompile_vm() or True)
    step('sauvegarde', unreal.EditorAssetLibrary.save_loaded_asset(bp))
    log['ok'] = True
except Exception as ex:  # compte rendu de la tentative, erreur exacte
    log['error'] = f'{type(ex).__name__}: {ex}'
    log['trace'] = traceback.format_exc()[-1500:]
os.makedirs(os.path.dirname(REPORT), exist_ok=True)
with open(REPORT, 'w', encoding='utf-8') as f:
    json.dump(log, f, ensure_ascii=False, indent=1)
unreal.log(('build-rider-controlrig : réussi' if log['ok'] else 'build-rider-controlrig : ÉCHEC ' + log.get('error', '')) + ' (' + REPORT + ')')
