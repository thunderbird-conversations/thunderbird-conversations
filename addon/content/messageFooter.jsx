/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ActionButton */
/* exported MessageFooter */

function MessageFooter({
  dispatch,
  msgUri,
  multipleRecipients,
  recipientsIncludeLists,
  isDraft,
}) {
  function action(msg) {
    dispatch({ ...msg, msgUri });
  }

  let footerActions = isDraft ? (
    <ActionButton callback={action} type="draft" />
  ) : (
    <>
      <ActionButton callback={action} type="reply" />
      {multipleRecipients && <ActionButton callback={action} type="replyAll" />}
      {recipientsIncludeLists && (
        <ActionButton callback={action} type="replyList" />
      )}
      <ActionButton callback={action} type="forward" />
    </>
  );

  return (
    <div className="messageFooter">
      <div className="footerActions">{footerActions}</div>
    </div>
  );
}

MessageFooter.propTypes = {
  dispatch: PropTypes.func.isRequired,
  msgUri: PropTypes.string.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
};
